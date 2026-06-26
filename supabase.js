const SUPABASE_URL = "https://lmwhmeomqcotysmynmrn.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtd2htZW9tcWNvdHlzbXlubXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDY3OTUsImV4cCI6MjA5MjQ4Mjc5NX0.2NgDdfJ_rnMrU4klZahfNxWzMVrRfMkGmV32opCtc8E";
let supabaseClient;

// Global state variables you can read anywhere in your p5 sketch
let currentPlayer = null;      // Will hold { id, email, name } once logged in
let lastSubmissionResult = null; // Will hold { success, bestTime, playerRank }

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.error("Supabase library not loaded. Add the CDN script tag to index.html!");
    return;
  }
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Check if a user is already logged in from a previous session
  checkActiveSession();
}

// Internal helper to sync global state
async function checkActiveSession() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    currentPlayer = {
      id: user.id,
      email: user.email,
      name: user.user_metadata.display_name || 'Anonymous'
    };
  }
}

/**
 * Creates a brand new player account.
 * Updates the global 'currentPlayer' variable on success.
 */
function registerPlayer(email, password, displayName) {
  supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: { data: { display_name: displayName } }
  }).then(({ data, error }) => {
    if (error) {
      console.error("Registration error:", error.message);
    } else if (data.user) {
      currentPlayer = { id: data.user.id, email: data.user.email, name: displayName };
      console.log("Account created! Logged in as:", currentPlayer.name);
    }
  });
}

/**
 * Logs into an existing account.
 * Updates the global 'currentPlayer' variable on success.
 */
function loginPlayer(email, password) {
  supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  }).then(({ data, error }) => {
    if (error) {
      console.error("Login error:", error.message);
    } else if (data.user) {
      currentPlayer = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.display_name || 'Anonymous'
      };
      console.log("Logged in successfully! Welcome,", currentPlayer.name);
    }
  });
}

/**
 * Logs out the current user and clears global state.
 */
function logoutPlayer() {
  supabaseClient.auth.signOut().then(() => {
    currentPlayer = null;
    lastSubmissionResult = null;
    console.log("Logged out successfully.");
  });
}

/**
 * Submits a time for the logged-in player.
 * Updates 'lastSubmissionResult' when the server responds.
 *
 * Note: this takes the level's raw DATA string, not a level ID — every
 * level (built-in or custom/editor-made) is identified to Supabase by a
 * hash of its own data (see hashLevelData()/levelKeyFor() in
 * Var+startUp.js), and that data is itself uploaded alongside the score so
 * the server has a record of exactly what level a time was set on.
 */
function submitLevelScore(levelData, timeTaken) {
  if (!currentPlayer) {
    console.warn("Cannot submit score: No player is logged in.");
    return;
  }

  const levelKey = hashLevelData(levelData);
  console.log("Submitting time to server...");

  supabaseClient.rpc('submit_and_rank_player_time', {
    p_player_id: currentPlayer.id,
    p_player_name: currentPlayer.name,
    p_level_key: levelKey,
    p_level_data: levelData,
    p_time_taken: timeTaken
  }).then(({ data, error }) => {
    if (error) {
      console.error("Submission failed:", error.message);
      lastSubmissionResult = { success: false, error: error.message };
    } else if (data && data.length > 0) {
      
      // CRITICAL FIX: Extract the first row from the returned data array
      let serverRow = data[0]; 
      
      lastSubmissionResult = {
        success: true,
        bestTime: parseFloat(serverRow.best_time),
        playerRank: parseInt(serverRow.player_rank, 10) // 1 to 5, or 1000
      };
      
      console.log("Server Response Received!", lastSubmissionResult);
    }
  });
}

/**
 * Fetches the global top-5 leaderboard for a level from Supabase.
 *   sorted fastest-first. Resolves to [] (never rejects) on any error, so
 *   callers can always render *something* without extra error handling.
 */
async function fetchLevelLeaderboard(levelData) {
  if (!supabaseClient) return [];
  const levelKey = hashLevelData(levelData);
  try {
    const { data, error } = await supabaseClient
      .from('scores')
      .select('player_name, time_taken')
      .eq('level_key', levelKey)
      .order('time_taken', { ascending: true })
      .limit(5);
    if (error) {
      console.error("Leaderboard fetch failed:", error.message);
      return [];
    }
    return (data || []).map((row) => ({
      name: row.player_name,
      time: parseFloat(row.time_taken),
    }));
  } catch (err) {
    console.error("Leaderboard fetch failed:", err);
    return [];
  }
}