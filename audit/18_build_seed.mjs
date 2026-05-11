// Build the JSON state object to seed the Supabase financial_state table
import { BASELINE_GLOBALS, BASELINE_PROJECTS, BASELINE_SCENARIO } from "../data.js";

const initialState = {
  globals: BASELINE_GLOBALS,
  scenario: BASELINE_SCENARIO,
  scenarios: [],
  projects: BASELINE_PROJECTS,
  audit_log: [],
  ui: { view: "portfolio", selected_project_id: "p2", theme: "light" },
};

// Output single-line JSON for SQL insertion (escape single quotes)
const json = JSON.stringify(initialState);
console.log(json);
