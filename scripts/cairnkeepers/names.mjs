/**
 * What the Cairnkeepers maps and tokens are called outside the repo, in a GM's library
 * (setup-library.mjs). Token names match the bestiary's "Token art" rows.
 */

export const MAP_NAMES = {
  "the-switchbacks": "The Switchbacks",
  "greywater-tarn": "Greywater Tarn",
  "hospice-of-st-brenn": "The Hospice of St. Brenn",
  "the-ice-caves": "The Ice Caves",
};

export const TOKEN_GROUPS = {
  Guides: {
    "pathfinder-a": "Pathfinder A", "pathfinder-b": "Pathfinder B", "hauler-a": "Hauler A", "hauler-b": "Hauler B",
    "hunter-a": "Hunter A", "hunter-b": "Hunter B", "stonespeaker-a": "Stonespeaker A", "stonespeaker-b": "Stonespeaker B",
  },
  Foes: {
    "white-coat": "White-coat", "scree-goat": "Scree Goat", rimehand: "Rimehand", "kettle-varga": "Kettle Varga",
    "ice-crawlers": "Ice-crawlers", "cairn-taker": "The Cairn-Taker",
  },
  "People and Board Pieces": {
    "brother-aldric": "Brother Aldric", survivor: "Survivor", warmth: "Warmth", "storm-clock": "Storm Clock",
    "cairn-fallen": "Cairn (fallen)", "cairn-raised": "Cairn (raised)",
  },
};

/** Every token's file slug and name, across the groups. */
export const TOKEN_NAMES = Object.assign({}, ...Object.values(TOKEN_GROUPS));
