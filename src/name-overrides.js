// Display-name overrides for techs whose HCP first-name field doesn't render
// well on the shop slide. Add a line here whenever you find a name that
// truncates badly or reads wrong.
//
// Key: the exact `first_name` value as stored in Housecall Pro
// Value: the first-name string we want shown on the deck
//
// This is intentionally manual rather than auto-detected — names are personal
// and the tech should be the one who decides how they're addressed.

export const FIRST_NAME_OVERRIDES = {
  "R Kevin": "Kevin",
  // Add more here as needed, e.g.:
  // "J Donald": "Don",
  // "T Jameson": "TJ",
};

// Apply override to a single first-name string.
// Falls back to the input unchanged.
export function overrideFirstName(rawFirstName) {
  if (!rawFirstName) return rawFirstName;
  const trimmed = rawFirstName.trim();
  return FIRST_NAME_OVERRIDES[trimmed] || trimmed;
}
